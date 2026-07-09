import { buildApp } from './app';

const PORT = Number(process.env.PORT || 4000);

buildApp()
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log('Triko backend: http://localhost:' + PORT + '/api/health'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
