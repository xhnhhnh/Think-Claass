import 'dotenv/config';
import { prisma } from './api/prismaClient';

async function main() {
  const users = await prisma.users.findMany({ take: 5 });
  console.log('Users found:', users.length);
  const classes = await prisma.classes.findMany({ take: 5 });
  console.log('Classes found:', classes.length);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Test successful');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
