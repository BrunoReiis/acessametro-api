import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';

const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv,
  databaseUrl:
    process.env.DATABASE_URL ??
    (nodeEnv === 'production' ? undefined : 'postgresql://postgres:postgres@localhost:5432/acessametro'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
};

export default env;
