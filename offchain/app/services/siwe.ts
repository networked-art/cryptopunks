import { SiweMessage, generateNonce, createViemConfig, configure } from '@signinwithethereum/siwe'
import type { HttpContext } from '@adonisjs/core/http'
import { HttpError } from '#exceptions/http_error'

const siweReady = createViemConfig().then(configure)

export function newNonce() {
  return generateNonce()
}

export async function verifySiweSignature(
  session: HttpContext['session'],
  message: string,
  signature: string
): Promise<`0x${string}`> {
  await siweReady
  const siweMessage = new SiweMessage(message)

  const sessionNonce = session.get('siwe_nonce')
  if (!sessionNonce || siweMessage.nonce !== sessionNonce) {
    throw new HttpError(401, 'Invalid nonce')
  }

  const result = await siweMessage.verify({
    signature,
    domain: siweMessage.domain,
    nonce: siweMessage.nonce,
  })
  if (!result.success) throw new HttpError(401, 'Invalid signature')

  session.forget('siwe_nonce')
  return siweMessage.address.toLowerCase() as `0x${string}`
}
