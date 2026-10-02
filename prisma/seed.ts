import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminExists = await prisma.user.findUnique({
    where: { email: 'admin@acessametro.com' },
  });

  if (!adminExists) {
    const passwordHash = await bcrypt.hash('123456', 10);

    await prisma.user.create({
      data: {
        name: 'Admin AcessaMetro',
        email: 'admin@acessametro.com',
        passwordHash,
        role: 'ADMIN',
      },
    });

    console.log('Usuário administrador criado com sucesso.');
  }

  const existingStations = await prisma.station.count();

  if (existingStations > 0) {
    console.log('Dados iniciais já existem. Seed ignorado.');
    return;
  }

  const stations = [
    {
      name: 'Estação Sé',
      line: 'Linha 3 - Vermelha',
      zone: 'Centro',
      latitude: -23.5505,
      longitude: -46.6333,
      accessibility: 'Elevadores, rampas, banheiros acessíveis',
    },
    {
      name: 'Estação Consolação',
      line: 'Linha 2 - Verde',
      zone: 'Centro',
      latitude: -23.5581,
      longitude: -46.6608,
      accessibility: 'Elevadores e sinalização tátil',
    },
    {
      name: 'Estação Ana Rosa',
      line: 'Linha 2 - Verde',
      zone: 'Pinheiros',
      latitude: -23.5509,
      longitude: -46.6921,
      accessibility: 'Rampa de acesso e plataforma com piso tátil',
    },
    {
      name: 'Estação Paraíso',
      line: 'Linha 1 - Azul',
      zone: 'Vila Mariana',
      latitude: -23.5754,
      longitude: -46.6401,
      accessibility: 'Elevadores e ajuda de staff disponível',
    },
    {
      name: 'Estação Jabaquara',
      line: 'Linha 1 - Azul',
      zone: 'Jabaquara',
      latitude: -23.6462,
      longitude: -46.641,
      accessibility: 'Área de embarque com acesso facilitado',
    },
  ];

  await prisma.station.createMany({
    data: stations,
  });

  console.log(`${stations.length} estações foram inseridas com sucesso.`);
}

main()
  .catch((error) => {
    console.error('Erro ao popular dados iniciais:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
