import dotenv from 'dotenv';

dotenv.config();

const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/acessametro',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
};

export default env;
