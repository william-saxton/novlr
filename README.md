# Novelr

Long-form writing in Obsidian with a structure you define and a compile pipeline that understands it.

Novelr is inspired by [Longform](https://github.com/kevboh/longform) and [novelWriter](https://novelwriter.io). Where Longform gives you a flat list of scenes, Novelr lets you decide the shape of your project: a novel made of chapters made of scenes, a novel with parts, a screenplay with acts and sequences, or anything else. Containers are real folders and content nodes are real notes, so your vault stays plain Markdown that any other tool can read.

## Installation

Requires Obsidian 1.13 or newer.

- **Community plugins**: search for "Novelr" in Settings › Community plugins once it is listed.
- **Manual**: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/william-saxton/novlr/releases/latest) into `<vault>/.obsidian/plugins/novelr/`, then enable the plugin.
- **BRAT**: add `william-saxton/novlr` in the BRAT plugin to follow releases before the directory listing.

## Concepts

- **Node type**: either a **container** (a folder with a title, holding other nodes) or **content** (a note with a title and a body). Each container type can restrict which types it accepts.
- **Schema**: the list of node types for a project plus the root type. The default preset is Novel › Chapter › Scene. Presets ship for "Novel with parts" and "Short story", and you can save your own.
- **Project**: a folder with an index note (default name `novelr.md`) whose `novelr` property holds the title, schema, ordered tree, and compile settings. Order lives in the index, so reordering never renames files.
- **Workflow**: a list of compile steps. Workflows are shared across the vault and each project picks one.

## Getting started

1. Enable the plugin and run **Novelr: Create new project** (or click the plus in the pane).
2. Pick a title, a location, and a structure preset. Novelr creates the folder and the index note.
3. Open the structure pane (ribbon icon or **Novelr: Open structure pane**). Add chapters and scenes, drag to reorder or move between chapters, right-click for more.
4. Switch to the **Compile** tab, pick a workflow, and press **Compile**.

Notes that already exist in the project folder but are not in the index appear under **Needs attention**; add them with one click or ignore them with a glob pattern.

## The index note

```yaml
---
novelr:
  version: 1
  title: The Hollow Road
  workflow: Manuscript (default)
  ignore:
    - _notes/**
  schema:
    rootType: novel
    types:
      - id: novel
        name: Novel
        kind: container
        allowedChildren: [chapter]
      - id: chapter
        name: Chapter
        kind: container
        allowedChildren: [scene]
      - id: scene
        name: Scene
        kind: content
  tree:
    - chapter: Chapter One
      children:
        - scene: Opening
        - scene: The Call
    - chapter: Chapter Two
      children:
        - scene: Aftermath
---
```

Each tree entry is `<typeId>: <name>`, optionally with `children`. Paths are derived from the tree: `Chapter One/Opening.md` is a scene inside the `Chapter One` folder. You can edit this by hand; Novelr tolerates mistakes and reports them in the pane.

Content notes get a `novelr-type` property when Novelr creates them, so Dataview and friends can query by type. Add `novelr-skip: true` to a note to leave it out of every compile.

## Statuses

Every node can carry a status such as New, In progress or Done. Statuses are defined per project in the **Project** tab and each one has:

- a **color** shown as a dot next to the node,
- an optional **parent status** that it pushes onto the node containing it,
- a **default** flag for newly created nodes.

Pushing works all the way up. With the defaults, a chapter marked Done that gains a New scene shows In progress (hollow dot, tooltip says why), and so does the novel above it. When the scene is finished, the chapter shows Done again. If several children push different statuses, the one listed first wins, so order the list from "most attention needed" down.

Colors are the eight theme accent colors or any hex value: the plus swatch opens a color picker, and custom colors are kept in a vault-wide palette (right-click a custom swatch to edit or remove it).

Click a node's dot, right-click and choose **Set status…**, or run **Novelr: Set status of current node**. Content notes also get a `novelr-status` property when "Write node type and status to files" is on.

```yaml
novelr:
  statuses:
    - { id: new, name: New, color: blue, parent: in-progress, default: true }
    - { id: in-progress, name: In progress, color: yellow, parent: in-progress }
    - { id: done, name: Done, color: green }
  tree:
    - chapter: Chapter One
      status: done
      children:
        - scene: Opening
          status: new
```

## Compile

A workflow is a sequence of steps of four kinds:

| Kind | What it sees | Built-in steps |
|---|---|---|
| Node | every node whose type matches the step's **Apply to** list (empty = all) | Strip frontmatter, Remove links, Remove comments, Remove strikethroughs, Remove headings, Insert before, Insert after, Find and replace, Trim whitespace |
| Structure | the whole tree, before it is built | Filter by status |
| Build | the whole tree, once | Build manuscript |
| Manuscript | the flattened text | Normalize blank lines, Find and replace, Add frontmatter, Save as note |

Node and structure steps come first, then one build step, then manuscript steps. **Filter by status** leaves out nodes with chosen statuses (a container's effective status counts, so a whole In progress chapter can be dropped) or keeps only content with chosen statuses, and renumbers what remains. **Insert before** and **Insert after** attach text to nodes of a given type, which is how you get chapter headings, part pages or scene separators:

- Chapter headings: *Insert before* on `chapter` with `# Chapter {number}: {title}`
- Scene separators: *Insert before* on `scene` with `* * *` and **Skip the first** on
- Part pages: *Insert before* on `part` with `{PB}# Part {number:Roman}{BR}{BR}## {title}`

### Placeholders

| Placeholder | Meaning |
|---|---|
| `{title}` `{type}` `{status}` `{status.id}` | the node's name, type id, effective status name and id |
| `{number}` | position among siblings of the same type (1-based) |
| `{count}` `{index}` `{absolute}` `{depth}` | siblings of this type, 0-based position among all siblings, position of this type across the whole project, nesting depth |
| `{number:word}` `{number:Word}` `{number:WORD}` `{number:roman}` `{number:Roman}` `{number:pad2}` | number formatting (works on any numeric placeholder) |
| `{parent.title}` `{parent.number}` | the containing node |
| `{chapter.title}` `{chapter.number}` | the nearest ancestor of that type (any type id works) |
| `{project.title}` `{date}` | project title, today's date |
| `{BR}` `{PB}` | line break, page break (configurable in settings) |
| `----` | as the whole value, a horizontal rule |

### User scripts

Point **User script folder** in settings at a vault folder. Every `.js` file there becomes a step and reloads when saved:

```js
export default {
  description: {
    name: "Shout",
    description: "Uppercases every scene.",
    kind: "node", // "node" | "tree" | "join" | "manuscript"
    options: [{ id: "suffix", name: "Suffix", type: "text", default: "!" }],
  },
  compile(node, ctx) {
    node.text = node.text.toUpperCase() + ctx.options.suffix;
  },
};
```

Scripts are ES modules (`export default { description, compile }`, or named `description` and `compile` exports) loaded by the browser's module loader, not evaluated as text. Node steps receive `(node, ctx)` and mutate `node.text`, `node.before` or `node.after`. Tree steps receive `(root, ctx)` and may prune or reorder `children`. Build steps receive `(root, ctx)` and return a string. Manuscript steps receive `(text, ctx)` and return a string. `ctx.format(fmt, node)` expands placeholders, `ctx.app` is the Obsidian app, and `ctx.obsidian` is the `obsidian` module (for `Notice`, `normalizePath` and friends).

## Commands

- Open structure pane
- Create new project
- Compile current project
- Open project index note
- Open next / previous content node
- Reveal active file in structure pane
- New node in current container
- Set status of current node

## Development

```
npm install
npm run dev     # rebuilds on change and copies into test-vault/.obsidian/plugins/novelr when that folder exists
npm test
npm run lint
npm run build
```

## License

[Apache-2.0](LICENSE)
