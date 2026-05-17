import { createEnsRoutes } from '@1001-digital/ponder-ens'
import { Hono } from 'hono'
import { client, graphql } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import salesRouter from './sales'
import { getOffchainDb } from '../offchain'

const app = new Hono()

app.use('/sql/*', client({ db, schema }))

app.route(
  '/profiles',
  createEnsRoutes({
    client: publicClients.mainnet!,
    db: await getOffchainDb(),
  }),
)

app.route('/sales', salesRouter)

app.use('/', graphql({ db, schema }))

export default app
