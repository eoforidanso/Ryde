/** Create the demo rider and driver used by the app. `npm run seed` */
import 'dotenv/config';
import { upsertUser } from './auth.ts';

const people: { id: string; name: string; msisdn: string; role: 'rider' | 'driver' }[] = [
  { id: 'rider-1', name: 'Ama Boakye', msisdn: '0244000418', role: 'rider' },
  { id: 'driver-1', name: 'Kwame Danso', msisdn: '0209990111', role: 'driver' },
  { id: 'driver-2', name: 'Naa Lartey', msisdn: '0271234567', role: 'driver' },
];

for (const person of people) {
  const user = upsertUser(person);
  console.log(`seeded ${user.role} ${user.id} — ${user.name} (${user.msisdn})`);
}

console.log('\nSign in from the app with any of these numbers.');
console.log('In mock mode the code is printed by the server and returned as devCode.');
