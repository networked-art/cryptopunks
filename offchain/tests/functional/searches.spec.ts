import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

async function cleanup() {
  await db.from('search_matches').delete()
  await db.from('notification_deliveries').delete()
  await db.from('inquiries').delete()
  await db.from('searches').delete()
  await db.from('auth_codes').delete()
  await db.from('auth_access_tokens').delete()
  await db.from('user_addresses').delete()
  await db.from('users').delete()
}

async function bearerFor(user: User) {
  const token = await user.issueToken('test')
  return token.value!.release()
}

test.group('Searches CRUD', (group) => {
  group.each.setup(cleanup)
  group.each.teardown(cleanup)

  test('rejects unauthenticated requests', async ({ client }) => {
    const response = await client.get('/searches')
    response.assertStatus(401)
  })

  test('creates and lists a search', async ({ client, assert }) => {
    const user = await User.create({ email: 'owner@example.com' })
    const bearer = await bearerFor(user)

    const create = await client
      .post('/searches')
      .bearerToken(bearer)
      .json({
        name: 'Aliens',
        criteria: { type: 'alien' },
        notify: true,
      })
    create.assertStatus(200)
    const created = create.body().search as { id: number; name: string; notify: boolean }
    assert.equal(created.name, 'Aliens')
    assert.equal(created.notify, true)

    const list = await client.get('/searches').bearerToken(bearer)
    list.assertStatus(200)
    const rows = list.body().searches as Array<{ id: number }>
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, created.id)
  })

  test('rejects invalid criteria', async ({ client }) => {
    const user = await User.create({ email: 'bad@example.com' })
    const bearer = await bearerFor(user)

    const response = await client
      .post('/searches')
      .bearerToken(bearer)
      .json({
        name: 'broken',
        criteria: { type: 'not-a-real-type-name' },
      })
    response.assertStatus(422)
  })

  test('cannot read another user search', async ({ client }) => {
    const a = await User.create({ email: 'a@example.com' })
    const b = await User.create({ email: 'b@example.com' })

    const create = await client
      .post('/searches')
      .bearerToken(await bearerFor(a))
      .json({ name: 'mine', criteria: {} })
    const id = create.body().search.id as number

    const fetch = await client.get(`/searches/${id}`).bearerToken(await bearerFor(b))
    fetch.assertStatus(404)
  })

  test('updates fields', async ({ client, assert }) => {
    const user = await User.create({ email: 'u@example.com' })
    const bearer = await bearerFor(user)
    const created = await client
      .post('/searches')
      .bearerToken(bearer)
      .json({ name: 'before', criteria: {} })
    const id = created.body().search.id

    const update = await client
      .patch(`/searches/${id}`)
      .bearerToken(bearer)
      .json({ name: 'after', notify: true })
    update.assertStatus(200)
    assert.equal(update.body().search.name, 'after')
    assert.equal(update.body().search.notify, true)
  })
})
