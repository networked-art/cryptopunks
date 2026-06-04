/// The generic contracts that make up a bot. A bot is a pipeline of three
/// pluggable parts — a {@link Source} of things worth posting, a {@link
/// Renderer} that turns each one into a {@link Post}, and a {@link Publisher}
/// that sends it somewhere. None of them know anything about CryptoPunks; the
/// punk-specific behaviour lives in implementations under `src/punks`.

/// A single image attached to a post. `data` is the encoded file (e.g. PNG
/// bytes), not raw pixels.
export interface Media {
  data: Uint8Array
  mimeType: 'image/png'
  /// Alt text for accessibility, attached when the publisher supports it.
  alt?: string
}

/// Everything needed to publish one update.
export interface Post {
  text: string
  media?: Media
}

/// A position in a {@link Source}'s stream. Opaque to the bot — it only ever
/// persists it verbatim and hands it back on the next run. Must be JSON-safe.
export type Cursor = unknown

/// An origin of things worth posting. Tracks its own position via a cursor the
/// bot persists between runs, so a crashed or restarted bot resumes where it
/// left off instead of replaying history.
export interface Source<C extends Cursor, Subject> {
  /// Human-readable name, used in logs.
  readonly name: string

  /// The cursor to use on the very first run, when no state is stored yet.
  /// Returning "now" makes a fresh bot ignore the backlog and only react to
  /// activity from this point forward.
  start(): Promise<C>

  /// Everything new since `cursor`, together with the cursor to persist for the
  /// next run. Implementations should advance the cursor only as far as the
  /// subjects they actually return, so nothing is skipped.
  pull(cursor: C): Promise<{ subjects: Subject[]; cursor: C }>
}

/// Turns a subject into a post. Returning `null` drops the subject silently —
/// the place to encode "not interesting enough to post" rules.
export interface Renderer<Subject> {
  render(subject: Subject): Promise<Post | null>
}

/// A destination for posts: Twitter in production, a logger in dry-run.
export interface Publisher {
  publish(post: Post): Promise<void>
}
