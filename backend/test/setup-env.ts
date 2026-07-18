// Zmienne środowiskowe dla testów e2e — ustawione zanim wczyta się AppModule.
import * as os from 'os';
import * as path from 'path';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
// Osobna baza per worker Jest — pliki e2e biegną równolegle i nie mogą
// czyścić sobie nawzajem danych (każdy robi dropDatabase).
const workerId = process.env.JEST_WORKER_ID ?? '1';
process.env.MONGO_URI =
  process.env.MONGO_URI_TEST ??
  `mongodb://localhost:27017/docugraph_test_${workerId}`;
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-test-secret-0123456789';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4'; // szybciej w testach
process.env.THROTTLE_LIMIT = '100000'; // praktycznie wyłączony w testach
// Limit auth wyłączony domyślnie, chyba że spec ustawi go wcześniej (test throttlingu).
process.env.AUTH_THROTTLE_LIMIT = process.env.AUTH_THROTTLE_LIMIT ?? '100000';
// Pliki .md w katalogu tymczasowym, osobnym per worker.
process.env.WORKSPACE_ROOT = path.join(os.tmpdir(), `docugraph-ws-${workerId}`);
