// Where consultation requests go.
// TODO: connect a real destination (e.g. your Telegram bot or CRM endpoint) before launch.
// Until then requests are only logged in the browser console and are NOT delivered anywhere.
export async function submitLead(lead) {
  console.info('[lead] not delivered yet, no endpoint configured:', lead);
  await new Promise((r) => setTimeout(r, 600));
}
