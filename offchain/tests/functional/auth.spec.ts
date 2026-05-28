import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import AuthCode from '#models/auth_code'

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

test.group('Auth — email PIN', (group) => {
  group.each.setup(cleanup)
  group.each.teardown(cleanup)

  test('request creates a user and an auth code', async ({ client, assert }) => {
    const response = await client.post('/auth/email/request').json({ email: 'a@example.com' })
    response.assertStatus(200)

    const user = await User.query().where('email', 'a@example.com').first()
    assert.ok(user)
    const code = await AuthCode.find(user!.id)
    assert.ok(code)
    assert.isNumber(code!.code)
  })

  test('verify with valid code mints a bearer token', async ({ client, assert }) => {
    const user = await User.create({ email: 'b@example.com' })
    const authCode = await AuthCode.newFor(user)

    const response = await client
      .post('/auth/email/verify')
      .json({ email: 'b@example.com', code: authCode.code })

    response.assertStatus(200)
    const body = response.body() as { token: string; user: { email: string } }
    assert.match(body.token, /^oc_/)
    assert.equal(body.user.email, 'b@example.com')

    const refreshed = await User.find(user.id)
    assert.ok(refreshed!.emailVerifiedAt)
  })

  test('verify with wrong code rejects', async ({ client }) => {
    const user = await User.create({ email: 'c@example.com' })
    await AuthCode.newFor(user)

    const response = await client
      .post('/auth/email/verify')
      .json({ email: 'c@example.com', code: 111_111 })

    response.assertStatus(401)
  })

  test('verify with expired code rejects', async ({ client }) => {
    const user = await User.create({ email: 'd@example.com' })
    const code = await AuthCode.newFor(user)
    code.expiresAt = DateTime.now().minus({ minutes: 1 })
    await code.save()

    const response = await client
      .post('/auth/email/verify')
      .json({ email: 'd@example.com', code: code.code })

    response.assertStatus(401)
  })
})
