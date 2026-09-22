export type KnobMap = Record<string, string>;

export type RawNode = {
  id: string;
  className: string;
  name: string;
  knobs: KnobMap;
  /** Input 0 is Nuke's B input. Null is a disconnected input. */
  inputs: (string | null)[];
  /** How many trailing entries of `inputs` are mask inputs from `N+M`. */
  maskInputs: number;
  children: RawNode[];
  cloneOf: string | null;
};

export type ParsedScript = {
  version: string | null;
  root: RawNode;
};
