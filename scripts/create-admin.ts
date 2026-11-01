import readline from 'readline';
import { db } from '../src/lib/db';
import { normalizeIndianPhone } from '../src/lib/phone';
import { Role } from '@prisma/client';

async function promptConfirmation(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const rawPhone = args[0];
  const name = args[1];

  if (!rawPhone) {
    console.error('Usage: npm run admin:create -- <PHONE_NUMBER> [NAME]');
    console.error('Example: npm run admin:create -- +919876543210 "Super Admin"');
    process.exit(1);
  }

  const phoneResult = normalizeIndianPhone(rawPhone);
  if (!phoneResult.isValid || !phoneResult.e164) {
    console.error(`Error: ${phoneResult.error || 'Invalid phone number'}`);
    process.exit(1);
  }

  const phone = phoneResult.e164;
  const isProd = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';

  if (isProd) {
    console.warn(`\n⚠️  WARNING: You are about to grant ADMIN privileges to ${phone} in PRODUCTION!`);
    const confirm = await promptConfirmation('Type YES to continue: ');
    if (confirm !== 'YES') {
      console.log('Operation aborted by user.');
      process.exit(0);
    }
  }

  const user = await db.user.upsert({
    where: { phone },
    update: {
      role: Role.ADMIN,
      name: name || undefined,
      isActive: true,
    },
    create: {
      phone,
      name: name || 'Admin Sahab',
      role: Role.ADMIN,
      language: 'en',
      isActive: true,
    },
  });

  console.log('\n===============================================================');
  console.log('                 ADMIN PRIVILEGES GRANTED                      ');
  console.log('===============================================================');
  console.log(`User ID : ${user.id}`);
  console.log(`Phone   : ${user.phone}`);
  console.log(`Name    : ${user.name}`);
  console.log(`Role    : ${user.role}`);
  console.log(`Status  : ${user.isActive ? 'Active' : 'Inactive'}`);
  console.log('===============================================================\n');

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
