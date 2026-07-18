import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Domyślnie każdy plik e2e dostaje własny, efemeryczny Mongo w pamięci —
 * zero zewnętrznej bazy, pełna izolacja, działa w CI „z pudełka".
 * Można nadpisać realnym Mongo, ustawiając MONGO_URI_TEST (np. do debugowania).
 *
 * Hook rejestruje się przez setupFilesAfterEnv, więc wykonuje się PRZED
 * `beforeAll` każdego speca, który kompiluje AppModule (a ten czyta MONGO_URI
 * dopiero w czasie compile).
 */
let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  if (process.env.MONGO_URI_TEST) {
    process.env.MONGO_URI = process.env.MONGO_URI_TEST;
    return;
  }
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
});

afterAll(async () => {
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
});
