/**
 * Raw SB3 structures produced by {@link parseProjectJson}. These intentionally
 * stay close to the on-disk `project.json` and are NOT `DslProject`: blocks,
 * variables, costumes, etc. are kept as raw values and converted to the DSL in
 * W3. Each raw node keeps its original object so unknown fields can be retained
 * opaquely later (draft §opaque保持モデル).
 */

export interface RawTarget {
    isStage: boolean;
    name: string;
    /** Raw block dictionary (id → raw block object); parsed into DSL in W3. */
    blocks: Record<string, unknown>;
    /** Block ids declared in this target, for reference resolution. */
    blockIds: Set<string>;
    variables: Record<string, unknown>;
    lists: Record<string, unknown>;
    broadcasts: Record<string, unknown>;
    comments: Record<string, unknown>;
    costumes: unknown[];
    sounds: unknown[];
    /** Original target object (opaque retention source). */
    raw: Record<string, unknown>;
}

/** Project-wide id sets collected during parse (sb3 block ids are unique project-wide). */
export interface ProjectIds {
    variables: Set<string>;
    lists: Set<string>;
    broadcasts: Set<string>;
}

export interface RawProject {
    targets: RawTarget[];
    monitors: unknown[];
    extensions: unknown[];
    meta: Record<string, unknown>;
    ids: ProjectIds;
    /** Original top-level object (opaque retention source). */
    raw: Record<string, unknown>;
}
