/**
 * Turn-cost browser half.
 *
 * Shows what the conversation just cost, in RMB:
 *
 *  1. one chip at the end of every completed Turn (`conversation.chat.turnTail`);
 *  2. one reading in the ambient dock under the composer
 *     (`conversation.composer.dock`) for the loaded conversation.
 *
 * Data comes from the Session's own durable accounting, not from a new
 * request: every completed Turn node carries the exact provider-reported token
 * buckets (un-cached input / cache hit / cache write / output) plus the
 * provider/model route of its billed attempts. Those numbers are priced with
 * DeepSeek's published list prices, so the plugin needs no Host service, tool,
 * prompt section, log write, or network access.
 *
 * The readings are estimates, not an invoice: prices are list prices, the
 * peak/off-peak band is derived from the Turn's clock time, and Chinese public
 * holidays (which DeepSeek bills as off-peak) are not detected. Subagent work
 * is billed in the subagent's own Session and is not part of the parent Turn.
 * The dock reading sums the same per-Turn numbers as the chips, so the two
 * always agree by construction.
 */

window.__ModuleLoader__.load({
  id: 'dsh-turn-cost-chip',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'turn-cost'

    // ---------------------------------------------------------------- locale

    // Bucket names and the `tok` unit follow the shipped turn-usage dialog so a
    // reader comparing both sees the same words for the same numbers.
    const zh = {
      'turn.prefix': '本轮',
      'total.prefix': '本次会话',
      'rate.peak': '高峰价',
      'rate.offPeak': '空闲价',
      'tip.estimate': '按 DeepSeek 官方刊例价估算，实际扣费以账单为准。',
      'tip.model': '提供方 / 模型：{model}',
      'tip.modelUnlisted': '该模型不在价格表内，按 {model} 计价',
      'tip.modelUnlistedSome': '含价格表未收录的模型，按同级模型计价',
      'tip.modelMissing': '本轮未记录模型，按 {model} 计价',
      'tip.rate': '计价：{band}',
      'tip.rateMix': '计价时段：高峰 {peak} 轮 / 空闲 {offPeak} 轮',
      'tip.input': '未缓存输入：{tokens} tok',
      'tip.cacheRead': '缓存读取：{tokens} tok',
      'tip.cacheWrite': '缓存写入：{tokens} tok',
      'tip.output': '输出：{tokens} tok',
      'tip.turns': '已统计 {turns} 轮；更早轮次点「加载更早」',
      'tip.holiday': '中国法定节假日未单独识别，会按工作日时段计价。',
    }

    const en = {
      'turn.prefix': 'Turn',
      'total.prefix': 'Session',
      'rate.peak': 'peak',
      'rate.offPeak': 'off-peak',
      'tip.estimate': 'Estimated from DeepSeek list prices; your invoice is authoritative.',
      'tip.model': 'Provider / model: {model}',
      'tip.modelUnlisted': 'That model is not in the price table; priced as {model}',
      'tip.modelUnlistedSome': 'Includes models the price table does not list; priced as their class',
      'tip.modelMissing': 'No model was recorded for this Turn; priced as {model}',
      'tip.rate': 'Rate: {band}',
      'tip.rateMix': 'Rate bands: {peak} peak / {offPeak} off-peak',
      'tip.input': 'Un-cached input: {tokens} tok',
      'tip.cacheRead': 'Cache read: {tokens} tok',
      'tip.cacheWrite': 'Cache write: {tokens} tok',
      'tip.output': 'Output: {tokens} tok',
      'tip.turns': 'Counted {turns} turns; use Load earlier for older ones',
      'tip.holiday': 'Chinese public holidays are not detected and price at the weekday band.',
    }

    // --------------------------------------------------------------- pricing

    /**
     * DeepSeek published list prices in CNY per 1,000,000 tokens, as
     * `[off-peak, peak]`. Peak hours are Asia/Shanghai 09:00–12:00 and
     * 14:00–18:00 on weekdays; every other time is off-peak at half the peak
     * price. Edit this table when DeepSeek changes prices: both readings and
     * every breakdown are priced from here.
     */
    const RATES = {
      'deepseek-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
      'deepseek-v4-pro': { hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] },
    }

    /** Legacy, versioned, and promo model ids that bill as a catalog entry. */
    const MODEL_ALIASES = {
      'deepseek-v4-flash': 'deepseek-flash',
      'deepseek-v4-flash-vision-exp': 'deepseek-flash',
      'deepseek-v4-flash-ioa': 'deepseek-flash',
      'deepseek-v4.1-flash': 'deepseek-flash',
      'deepseek-v4.1-flash-1017': 'deepseek-flash',
      'deepseek-v4-pro-0813': 'deepseek-v4-pro',
      'deepseek-v4-pro-ioa': 'deepseek-v4-pro',
    }

    const DEFAULT_MODEL = 'deepseek-flash'

    /**
     * Resolve the rate row for one provider model id.
     * @param model - model id reported by the assistant message, if any.
     * @returns the rate row, the catalog model it came from, and whether that
     * id was actually in the table.
     */
    function rateFor(model) {
      const key = typeof model === 'string' ? model.trim().toLowerCase() : ''
      const canonical = MODEL_ALIASES[key] !== undefined
        ? MODEL_ALIASES[key]
        : Object.prototype.hasOwnProperty.call(RATES, key) ? key : undefined
      if (canonical !== undefined) {
        return { model: canonical, rates: RATES[canonical], known: true }
      }
      // An uncatalogued route keeps a plausible reading instead of hiding the
      // number: Pro-class ids are priced as Pro, everything else as Flash.
      const fallback = key.includes('pro') ? 'deepseek-v4-pro' : DEFAULT_MODEL
      return { model: fallback, rates: RATES[fallback], known: false }
    }

    const beijingClock = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    /**
     * Whether one instant falls inside DeepSeek's peak-price window.
     * @param timeMs - epoch milliseconds of the Turn's completion.
     * @returns true for weekday peak windows in Asia/Shanghai.
     */
    function isPeakHour(timeMs) {
      if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) return false
      let parts
      try {
        parts = beijingClock.formatToParts(new Date(timeMs))
      } catch {
        return false
      }
      const field = (type) => {
        const found = parts.find((part) => part.type === type)
        return found === undefined ? '' : found.value
      }
      const weekday = field('weekday')
      if (weekday === 'Sat' || weekday === 'Sun') return false
      const hour = Number(field('hour')) % 24
      const minute = Number(field('minute'))
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false
      const minutes = hour * 60 + minute
      return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080)
    }

    function toCount(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
    }

    /**
     * Price one Turn's reported token buckets.
     * @param usage - the Turn's token accounting from the Chat snapshot.
     * @param timeMs - the Turn's completion time, used to pick the price band.
     * @returns cost in CNY plus the buckets and rate basis used.
     */
    function priceUsage(usage, timeMs) {
      const routes = Array.isArray(usage.routes) ? usage.routes : []
      const route = routes.length > 0 ? routes[0] : undefined
      const priced = rateFor(route === undefined ? undefined : route.model)
      const peak = isPeakHour(timeMs)
      const band = peak ? 1 : 0
      // Cache-write traffic is prompt-side traffic no reader got a cache hit
      // for, so it is priced at the cache-miss rate.
      const uncached = toCount(usage.uncachedInputTokens)
      const cacheRead = toCount(usage.cacheReadTokens)
      const cacheWrite = toCount(usage.cacheWriteTokens)
      const output = toCount(usage.outputTokens)
      const cost = (uncached + cacheWrite) / 1e6 * priced.rates.miss[band]
        + cacheRead / 1e6 * priced.rates.hit[band]
        + output / 1e6 * priced.rates.out[band]
      return {
        cost,
        peak,
        model: priced.model,
        known: priced.known,
        route: route === undefined ? undefined : `${route.provider}/${route.model}`,
        uncached,
        cacheRead,
        cacheWrite,
        output,
      }
    }

    // ------------------------------------------------------------ formatting

    /**
     * Format exact token counts with thousands grouping, matching the shipped
     * usage dialog's `{count} tok` readings.
     * @param value - token count.
     * @returns grouped count.
     */
    function formatExact(value) {
      return String(Math.round(toCount(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    /**
     * Format CNY: decimals follow the magnitude, trailing zeros are dropped
     * down to two, thousands are grouped, and a real cost too small to print
     * says so instead of reading as zero.
     * @param value - amount in CNY.
     * @returns display string starting with `¥`.
     */
    function formatCNY(value) {
      const amount = toCount(value)
      if (amount === 0) return '¥0'
      if (amount < 0.0001) return '<¥0.0001'
      const digits = amount >= 1 ? 2 : amount >= 0.01 ? 4 : 5
      // Keep at least two decimals so money never reads as a bare integer.
      const text = amount.toFixed(digits).replace(/(\.\d{2,}?)0+$/, '$1')
      const [whole, fraction] = text.split('.')
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      return fraction === undefined ? `¥${grouped}` : `¥${grouped}.${fraction}`
    }

    // -------------------------------------------------------------- snapshot

    /**
     * Read one Turn's footer data, which carries its exact token accounting.
     * @param nodes - the Chat node store.
     * @param locations - the Chat location index.
     * @param turn - owning Turn number.
     * @returns the Turn footer data, or undefined before the Turn settles.
     */
    function tailDataOf(nodes, locations, turn) {
      if (nodes === undefined || locations === undefined) return undefined
      const keys = locations.getTurn(turn)
      if (keys === undefined || keys === null) return undefined
      const list = typeof keys.length === 'number' ? keys : []
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const node = nodes.get(list[index])
        if (node !== undefined && node !== null && node.kind === 'turn-tail') return node.data
      }
      return undefined
    }

    /**
     * Fold the loaded Turns' accounting into one conversation reading.
     * @param parts - the Turn order plus the Chat node store and location index.
     * @returns summed cost, billed Turn count, summed buckets, routes, bands.
     */
    function conversationSpend(parts) {
      const { turnOrder, nodes, locations } = parts
      const total = {
        cost: 0, turns: 0, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0,
        models: [], unknownModel: false, peakTurns: 0,
      }
      if (turnOrder === undefined || turnOrder === null
        || typeof turnOrder[Symbol.iterator] !== 'function') return total
      for (const turn of turnOrder) {
        const data = tailDataOf(nodes, locations, turn)
        if (data === undefined || data.tokenUsage === undefined) continue
        const priced = priceUsage(data.tokenUsage, data.time)
        total.cost += priced.cost
        total.turns += 1
        total.uncached += priced.uncached
        total.cacheRead += priced.cacheRead
        total.cacheWrite += priced.cacheWrite
        total.output += priced.output
        if (priced.peak) total.peakTurns += 1
        if (!priced.known) total.unknownModel = true
        if (priced.route !== undefined && !total.models.includes(priced.route)) {
          total.models.push(priced.route)
        }
      }
      return total
    }

    // ------------------------------------------------------------ components

    // The composer dock's own pills use these content-font tokens, so the chip
    // below a reply and the reading under the composer share one size and grow
    // together when the UI font is raised.
    const readingStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
      color: 'var(--dsw-alias-label-tertiary)',
      fontVariantNumeric: 'tabular-nums',
      cursor: 'default',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    }

    const valueStyle = {
      color: 'var(--dsw-alias-label-secondary)',
      fontWeight: 500,
    }

    const pillStyle = {
      ...readingStyle,
      padding: '1px 8px',
      borderRadius: 'var(--dsw-radius-sm)',
    }

    /** The same clip-block the shipped icon actions use for screen-reader-only text. */
    const visuallyHiddenStyle = {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
      border: '0',
    }

    /**
     * Breakdown lines for one priced Turn.
     * @param priced - a priced Turn.
     * @param t - locale translate seat.
     * @returns tooltip and screen-reader lines, most specific first.
     */
    function turnBreakdown(priced, t) {
      const lines = []
      if (priced.route !== undefined) {
        lines.push(t('tip.model', { model: priced.route }))
        if (!priced.known) lines.push(t('tip.modelUnlisted', { model: priced.model }))
      } else {
        lines.push(t('tip.modelMissing', { model: priced.model }))
      }
      lines.push(t('tip.rate', { band: priced.peak ? t('rate.peak') : t('rate.offPeak') }))
      lines.push(t('tip.input', { tokens: formatExact(priced.uncached) }))
      if (priced.cacheRead > 0) lines.push(t('tip.cacheRead', { tokens: formatExact(priced.cacheRead) }))
      if (priced.cacheWrite > 0) lines.push(t('tip.cacheWrite', { tokens: formatExact(priced.cacheWrite) }))
      lines.push(t('tip.output', { tokens: formatExact(priced.output) }))
      lines.push(t('tip.estimate'))
      return lines
    }

    /**
     * Breakdown lines for the conversation reading.
     * @param spend - a folded conversation reading.
     * @param t - locale translate seat.
     * @returns tooltip and screen-reader lines, most specific first.
     */
    function sessionBreakdown(spend, t) {
      const lines = [t('tip.turns', { turns: spend.turns })]
      if (spend.models.length > 0) lines.push(t('tip.model', { model: spend.models.join(' / ') }))
      if (spend.unknownModel) lines.push(t('tip.modelUnlistedSome'))
      lines.push(t('tip.rateMix', { peak: spend.peakTurns, offPeak: spend.turns - spend.peakTurns }))
      lines.push(t('tip.input', { tokens: formatExact(spend.uncached) }))
      if (spend.cacheRead > 0) lines.push(t('tip.cacheRead', { tokens: formatExact(spend.cacheRead) }))
      if (spend.cacheWrite > 0) lines.push(t('tip.cacheWrite', { tokens: formatExact(spend.cacheWrite) }))
      lines.push(t('tip.output', { tokens: formatExact(spend.output) }))
      lines.push(t('tip.estimate'))
      lines.push(t('tip.holiday'))
      return lines
    }

    /**
     * One reading: the visible amount plus a screen-reader-only breakdown, so
     * the caveats are not reachable only by hovering.
     * @param props - reading parts.
     * @returns the reading element.
     */
    function Reading({ style, dataAttribute, prefix, amount, title, lines }) {
      return h(
        'span',
        { style, title, role: 'note', [dataAttribute]: amount },
        h('span', { 'aria-hidden': true }, prefix),
        h('span', { style: valueStyle, 'aria-hidden': true }, amount),
        h('span', { style: visuallyHiddenStyle }, [`${prefix} ${amount}`].concat(lines).join(' · ')),
      )
    }

    /** The per-Turn chip; returns nothing while a Turn has no billing data. */
    function TurnCostChip(props) {
      if (typeof props.useChat !== 'function') return null
      return h(TurnCostChipContent, props)
    }

    function TurnCostChipContent({ useChat, turn, t }) {
      const turnNumber = turn !== undefined && turn !== null && typeof turn.turn === 'number'
        ? turn.turn
        : -1
      // Select the settled Turn data itself (a stable reference) instead of the
      // whole snapshot, so streamed tokens elsewhere cannot re-render this chip.
      const settled = useChat((snapshot) => tailDataOf(
        snapshot.nodes, snapshot.locations, turnNumber,
      ))
      const local = turn !== undefined && turn !== null && turn.data !== undefined
        && typeof turn.data.get === 'function' ? turn.data.get('turn-tail') : undefined
      const data = settled !== undefined && settled.tokenUsage !== undefined ? settled : local
      const priced = React.useMemo(() => {
        if (data === undefined || data === null || data.tokenUsage === undefined) return undefined
        return priceUsage(data.tokenUsage, data.time)
      }, [data])
      if (priced === undefined || priced.cost <= 0) return null
      const lines = turnBreakdown(priced, t)
      const amount = formatCNY(priced.cost)
      return h(Reading, {
        style: readingStyle,
        dataAttribute: 'data-turn-cost',
        prefix: t('turn.prefix'),
        amount,
        title: [`${t('turn.prefix')} ≈ ${amount}`].concat(lines).join('\n'),
        lines,
      })
    }

    /** The conversation reading under the composer, summed from loaded Turns. */
    function SessionCostPill(props) {
      if (typeof props.useChat !== 'function') return null
      return h(SessionCostPillContent, props)
    }

    function SessionCostPillContent({ useChat, t }) {
      // Narrow subscriptions: these four references stay stable while tokens
      // stream, so the fold below runs when a Turn appears or settles, not on
      // every published chunk. `turnEnds` is the settle signal: a Turn's
      // accounting finalizes at `turn/end`.
      const turnOrder = useChat((snapshot) => snapshot.timeline.turnOrder)
      const turnEnds = useChat((snapshot) => snapshot.legacy.turnEnds)
      const nodes = useChat((snapshot) => snapshot.nodes)
      const locations = useChat((snapshot) => snapshot.locations)
      const spend = React.useMemo(
        () => conversationSpend({ turnOrder, nodes, locations }),
        [turnOrder, turnEnds, nodes, locations],
      )
      if (spend.turns === 0 || spend.cost <= 0) return null
      const lines = sessionBreakdown(spend, t)
      const amount = formatCNY(spend.cost)
      return h(Reading, {
        style: pillStyle,
        dataAttribute: 'data-turn-cost-total',
        prefix: t('total.prefix'),
        amount,
        title: [`${t('total.prefix')} ≈ ${amount}`].concat(lines).join('\n'),
        lines,
      })
    }

    // ----------------------------------------------------------------- apply

    /**
     * Register both readings. Each registration rides this plugin's fiber, so
     * disabling the plugin removes the chip and the dock reading with it.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-cost: dictionaries')
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: 'turn-cost-per-turn',
        order: 0,
        locale: NS,
      }, TurnCostChip))
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'turn-cost-session',
        order: 12,
        locale: NS,
      }, SessionCostPill))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
