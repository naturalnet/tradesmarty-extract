import { extractAdmiralsSafety } from '../../brokers/admirals/safety.js';


export async function extract({ brokerSlug, ctx }) {
switch (brokerSlug) {
case 'admirals':
case 'admiralmarkets':
case 'admiral':
return await extractAdmiralsSafety();
default:
return null; // other brokers will be added next
}
}
