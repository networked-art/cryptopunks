import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import Search from '#models/search'
import { DEFAULT_NOTIFY_KINDS, DEFAULT_NOTIFY_SOURCES } from '#models/search'

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

async function createSearchFor(user: User) {
  return Search.create({
    userId: user.id,
    name: 'Test',
    criteria: { type: 'alien' },
    notify: false,
    notifyFrequency: 'immediate',
    notifySources: DEFAULT_NOTIFY_SOURCES,
    notifyKinds: DEFAULT_NOTIFY_KINDS,
    maxPriceWei: null,
    lastMatchedAt: null,
  })
}

test.group('Inquiries', (group) => {
  group.each.setup(cleanup)
  group.each.teardown(cleanup)

  test('create + cancel', async ({ client, assert }) => {
    const user = await User.create({ email: 'i@example.com' })
    const bearer = await bearerFor(user)
    const search = await createSearchFor(user)

    const create = await client
      .post('/inquiries')
      .bearerToken(bearer)
      .json({ searchId: search.id, note: 'looking for one' })
    create.assertStatus(200)
    const inquiry = create.body().inquiry as { id: number; status: string }
    assert.equal(inquiry.status, 'open')

    const cancel = await client.post(`/inquiries/${inquiry.id}/cancel`).bearerToken(bearer)
    cancel.assertStatus(200)
    assert.equal(cancel.body().inquiry.status, 'cancelled')
  })

  test('refuses inquiry against another user search', async ({ client }) => {
    const a = await User.create({ email: 'a2@example.com' })
    const b = await User.create({ email: 'b2@example.com' })
    const aSearch = await createSearchFor(a)

    const response = await client
      .post('/inquiries')
      .bearerToken(await bearerFor(b))
      .json({ searchId: aSearch.id })
    response.assertStatus(404)
  })

  test('cannot edit a non-open inquiry', async ({ client, assert }) => {
    const user = await User.create({ email: 'c2@example.com' })
    const bearer = await bearerFor(user)
    const search = await createSearchFor(user)

    const create = await client
      .post('/inquiries')
      .bearerToken(bearer)
      .json({ searchId: search.id })
    const id = create.body().inquiry.id

    await client.post(`/inquiries/${id}/cancel`).bearerToken(bearer)

    const update = await client.patch(`/inquiries/${id}`).bearerToken(bearer).json({ note: 'no' })
    update.assertStatus(400)
    assert.ok(true)
  })

  test('non-owner cannot cancel', async ({ client }) => {
    const a = await User.create({ email: 'aa@example.com' })
    const b = await User.create({ email: 'bb@example.com' })
    const aSearch = await createSearchFor(a)
    const create = await client
      .post('/inquiries')
      .bearerToken(await bearerFor(a))
      .json({ searchId: aSearch.id })
    const id = create.body().inquiry.id

    const cancel = await client.post(`/inquiries/${id}/cancel`).bearerToken(await bearerFor(b))
    cancel.assertStatus(404)
  })

  test('status_changed_at moves on cancel', async ({ client, assert }) => {
    const user = await User.create({ email: 'sc@example.com' })
    const bearer = await bearerFor(user)
    const search = await createSearchFor(user)
    const create = await client
      .post('/inquiries')
      .bearerToken(bearer)
      .json({ searchId: search.id })
    const id = create.body().inquiry.id as number
    const startedAt = DateTime.fromISO(create.body().inquiry.status_changed_at).toMillis()

    await new Promise((r) => setTimeout(r, 25))
    const cancel = await client.post(`/inquiries/${id}/cancel`).bearerToken(bearer)
    const cancelledAt = DateTime.fromISO(cancel.body().inquiry.status_changed_at).toMillis()
    assert.isAbove(cancelledAt, startedAt)
  })
})
