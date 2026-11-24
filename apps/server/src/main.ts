import { createApp } from './app.ts';
import { readEnv } from './env.ts';

const { PORT } = readEnv();
createApp().listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
