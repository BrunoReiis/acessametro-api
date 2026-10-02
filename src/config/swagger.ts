import swaggerJsdoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'AcessaMetrô API',
    version: '1.0.0',
    description: 'API backend para acessibilidade em transporte público.',
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT ?? 3333}`,
      description: 'Servidor local',
    },
  ],
  tags: [
    { name: 'Auth', description: 'Autenticação e usuários' },
    { name: 'Stations', description: 'Estações e consulta pública' },
    { name: 'Incidents', description: 'Denúncias e incidentes' },
    { name: 'Reviews', description: 'Avaliações e feedback' },
    { name: 'Health', description: 'Status da API' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

export const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: ['./src/**/*.ts'],
});
