import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TwitterApi, type EUploadMimeType } from 'twitter-api-v2'
import { log, formatError } from './log'
import type { StateFile } from './state'
import type { Post, Publisher } from './types'

export interface TwitterCredentials {
  clientId: string
  clientSecret: string
  /// Seed OAuth2 tokens. The first run refreshes them; rotated tokens are then
  /// persisted in the state file and used in preference to these.
  accessToken: string
  refreshToken: string
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
}

const TOKEN_KEY = 'twitter'

/// Posts to Twitter over the OAuth2 user-context flow. The refresh token
/// rotates on every refresh, so it's persisted back to the state file —
/// otherwise the bot would be locked out after the seed token is first used.
export class TwitterPublisher implements Publisher {
  private client: TwitterApi | null = null

  constructor(
    private readonly credentials: TwitterCredentials,
    private readonly state: StateFile,
  ) {}

  async publish(post: Post): Promise<void> {
    const client = await this.connect()

    if (!post.media) {
      await client.v2.tweet({ text: post.text })
      log.info(`Tweeted: ${firstLine(post.text)}`)
      return
    }

    const mediaId = await client.v2.uploadMedia(Buffer.from(post.media.data), {
      media_type: post.media.mimeType as EUploadMimeType,
    })
    if (post.media.alt) {
      await client.v2.createMediaMetadata(mediaId, {
        alt_text: { text: post.media.alt },
      })
    }
    await client.v2.tweet({ text: post.text, media: { media_ids: [mediaId] } })
    log.info(`Tweeted: ${firstLine(post.text)}`)
  }

  private async connect(): Promise<TwitterApi> {
    if (this.client) return this.client

    const oauth = new TwitterApi({
      clientId: this.credentials.clientId,
      clientSecret: this.credentials.clientSecret,
    })

    const stored = this.state.get<StoredTokens>(TOKEN_KEY)
    const refreshToken = stored?.refreshToken ?? this.credentials.refreshToken
    let accessToken = stored?.accessToken ?? this.credentials.accessToken

    try {
      const refreshed = await oauth.refreshOAuth2Token(refreshToken)
      accessToken = refreshed.accessToken
      this.state.set<StoredTokens>(TOKEN_KEY, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? refreshToken,
      })
    } catch (error) {
      // A failed refresh isn't fatal — the existing access token may still be
      // valid. Surface it and let the tweet attempt be the real test.
      log.warn(`Twitter token refresh failed: ${formatError(error)}`)
    }

    this.client = new TwitterApi(accessToken)
    return this.client
  }
}

/// Stand-in publisher for local runs without credentials: prints the text and
/// writes the image to a temp file you can open. The bot is otherwise identical
/// to a live run, so it's the way to preview grids before tokens exist.
export class DryRunPublisher implements Publisher {
  constructor(private readonly outputDir: string = tmpdir()) {}

  async publish(post: Post): Promise<void> {
    log.info(`\n--- dry run ---\n${post.text}\n---------------`)
    if (post.media) {
      const path = join(this.outputDir, `punks-bot-${Date.now()}.png`)
      writeFileSync(path, post.media.data)
      log.info(`Image written to ${path}`)
    }
  }
}

function firstLine(text: string): string {
  return text.split('\n')[0]
}
