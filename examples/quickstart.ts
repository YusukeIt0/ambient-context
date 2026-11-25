// node examples/quickstart.ts 35.6852 139.7101
// Prints every source for one position. Run `npm run build` first when using this checkout.
import { getEnvironmentalContext } from 'ambient-context';

const [latitude, longitude] = process.argv.slice(2).map(Number);
const context = await getEnvironmentalContext(
  {latitude: latitude ?? 35.6852, longitude: longitude ?? 139.7101, accuracy: 10},
  {userAgent: process.env.MET_USER_AGENT ?? 'MyAmbientApp/0.1 (+https://example.com/contact)'},
);
console.log(JSON.stringify(context, null, 2));
