import { db } from '../src/lib/db';

async function main() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  console.log(`[OTP Cleanup] Deleting OtpCode records created before ${oneDayAgo.toISOString()}...`);

  const result = await db.otpCode.deleteMany({
    where: {
      createdAt: {
        lt: oneDayAgo,
      },
    },
  });

  console.log(`[OTP Cleanup] Successfully deleted ${result.count} stale OTP record(s).`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('[OTP Cleanup] Error:', e);
  await db.$disconnect();
  process.exit(1);
});
