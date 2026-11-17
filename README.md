# Turn cost (对话费用)

Shows what the conversation costs, in RMB, without sending anything extra.

| Where | Reads like | Meaning |
| --- | --- | --- |
| End of every completed reply | `本轮 ¥0.0421` | Cost of that Turn, including every model request and tool call inside it |
| Dock under the composer | `本次会话 ¥0.87` | Running cost of the conversation so far |

Hover either reading for the breakdown: model route, peak or off-peak price
band, un-cached input, cache-read input, cache write, output, and the pricing
caveat. The same sentence is exposed to screen readers next to the number, so
the caveats never hide behind a hover.

## Where the numbers come from

DeepSeek Harness already records exact provider-reported token usage for every
Turn, together with the provider/model route of the request that produced it.
This plugin reads that existing accounting from the Session in the browser and
multiplies it by DeepSeek's published list prices. It adds no model request, no
Session event, no Host service, and no tool; disabling the plugin removes both
readings.

## Prices

Prices live in `client.js` under `RATES` as CNY per 1,000,000 tokens, written
as `[off-peak, peak]` for the cache-hit input, cache-miss input and output
buckets. They are DeepSeek's published list prices:

| Model | Cache hit | Cache miss | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro` | 0.15 / 0.30 | 4.5 / 9 | 13.5 / 27 |

Peak is Asia/Shanghai 09:00–12:00 and 14:00–18:00 on weekdays; everything else
is off-peak at half the peak price. Edit `RATES` and `MODEL_ALIASES` in
`client.js` when prices or model ids change, then reload the page. A model id
that the table does not list is priced as its class (Pro-class ids as
`deepseek-v4-pro`, everything else as `deepseek-flash`) and the tooltip says so.

## Limitations

- **Estimate, not an invoice.** List prices, not your account's discounts,
  grants or coupons. The provider's bill is authoritative.
- **Chinese public holidays are not detected.** A holiday weekday inside a peak
  window is priced at the peak rate, so the reading can be up to 2× high on
  those days.
- **The conversation total covers the loaded window.** Turns older than the
  page currently loaded are not counted, and the tooltip states how many Turns
  were counted; the per-Turn chips stay exact regardless. The total is the sum
  of those same chips, so the two readings always agree.
- **Subagent work is not included.** A child agent bills in its own Session, so
  its tokens do not appear in the parent Turn.
- **One route per Turn is priced.** A Turn that switched models between steps is
  priced at the first route it reported, because the token totals are not split
  per route.

## Install

From GitHub (works on a profile started with `dsh`):

```sh
dsh plugin --profile <profile> add github:yangyanlu06/dsh-turn-cost-chip
```

Or from a local checkout / tarball:

```sh
dsh plugin --profile <profile> add ./dsh-turn-cost-chip-1.0.0.tgz
```

Inside the Desktop app you can also use **Settings → Plugins → Add plugin → local
directory** and point it at this folder. The two readings appear on the next page
load; no restart is needed. Disable the bundle to hide them again.
