import { createOffchainDb } from '@1001-digital/ponder-ens'

let dbPromise: ReturnType<typeof createOffchainDb> | undefined

export async function getOffchainDb() {
  dbPromise ??= createOffchainDb()
  return (await dbPromise).db
}
