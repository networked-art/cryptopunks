import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TwitterApi, type EUploadMimeType } from 'twitter-api-v2'
import { log } from './log'
import type { Post, Publisher } from './types'

/// OAuth 1.0a user-context credentials for a single posting account. Unlike
/// OAuth2 they never expire and need no refresh: the app's API key/secret plus
/// an access token/secret minted for the account (with Read + Write permission).
export interface TwitterCredentials {
  /// "API Key" / Consumer Key.
  apiKey: string
  /// "API Key Secret" / Consumer Secret.
  apiSecret: string
  /// The account's Access Token.
  accessToken: string
  /// The account's Access Token Secret.
  accessSecret: string
}

/// Posts to Twitter/X as a single account over OAuth 1.0a. Media is uploaded
/// first, then attached to the tweet. The credentials are static, so there's no
/// connect/refresh dance — the client is built once.
export class TwitterPublisher implements Publisher {
  private readonly client: TwitterApi

  constructor(credentials: TwitterCredentials) {
    this.client = new TwitterApi({
      appKey: credentials.apiKey,
      appSecret: credentials.apiSecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessSecret,
    })
  }

  async publish(post: Post): Promise<void> {
    if (!post.media) {
      await this.client.v2.tweet({ text: post.text })
      log.info(`Tweeted: ${firstLine(post.text)}`)
      return
    }

    const mediaId = await this.client.v2.uploadMedia(
      Buffer.from(post.media.data),
      {
        media_type: post.media.mimeType as EUploadMimeType,
      },
    )
    if (post.media.alt) {
      await this.client.v2.createMediaMetadata(mediaId, {
        alt_text: { text: post.media.alt },
      })
    }
    await this.client.v2.tweet({
      text: post.text,
      media: { media_ids: [mediaId] },
    })
    log.info(`Tweeted: ${firstLine(post.text)}`)
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
