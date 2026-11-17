/**
 * Host half of the turn-cost bundle.
 *
 * The whole feature lives in the browser half (`client.js`): it reads the
 * Session's own durable token accounting from the Chat snapshot and prices it
 * with DeepSeek's published list prices. No Host service, tool, prompt section
 * or model request is added, so this entry intentionally has no state.
 */

export function apply() {}
