# Novelr

Long-form writing in Obsidian with a structure you define and a compile pipeline that understands it.

Novelr is inspired by [Longform](https://github.com/kevboh/longform) and [novelWriter](https://novelwriter.io). Where Longform gives you a flat list of scenes, Novelr lets you decide the shape of your project: a novel made of chapters made of scenes, a novel with parts, a screenplay with acts and sequences, or anything else. Containers are real folders and content nodes are real notes, so your vault stays plain Markdown that any other tool can read.

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

## Compile

A workflow is a sequence of steps of three kinds:

| Kind | What it sees | Built-in steps |
|---|---|---|
| Node | every node whose type matches the step's **Apply to** list (empty = all) | Strip frontmatter, Remove links, Remove comments, Remove strikethroughs, Remove headings, Insert before, Insert after, Find and replace, Trim whitespace |
| Build | the whole tree, once | Build manuscript |
| Manuscript | the flattened text | Normalize blank lines, Find and replace, Add frontmatter, Save as note |

Node steps come first, then one build step, then manuscript steps. **Insert before** and **Insert after** attach text to nodes of a given type, which is how you get chapter headings, part pages or scene separators:

- Chapter headings: *Insert before* on `chapter` with `# Chapter {number}: {title}`
- Scene separators: *Insert before* on `scene` with `* * *` and **Skip the first** on
- Part pages: *Insert before* on `part` with `{PB}# Part {number:Roman}{BR}{BR}## {title}`

### Placeholders

| Placeholder | Meaning |
|---|---|
| `{title}` `{type}` | the node's name and type id |
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
module.exports = {
  description: {
    name: "Shout",
    description: "Uppercases every scene.",
    kind: "node", // "node" | "join" | "manuscript"
    options: [{ id: "suffix", name: "Suffix", type: "text", default: "!" }],
  },
  compile(node, ctx) {
    node.text = node.text.toUpperCase() + ctx.options.suffix;
  },
};
```

Node steps receive `(node, ctx)` and mutate `node.text`, `node.before` or `node.after`. Build steps receive `(root, ctx)` and return a string. Manuscript steps receive `(text, ctx)` and return a string. `ctx.format(fmt, node)` expands placeholders, `ctx.app` is the Obsidian app, and `require("obsidian")` is available.

## Commands

- Open structure pane
- Create new project
- Compile current project
- Open project index note
- Open next / previous content node
- Reveal active file in structure pane
- New node in current container

## Development

```
npm install
npm run dev     # rebuilds on change and copies into test-vault/.obsidian/plugins/novelr when that folder exists
npm test
npm run lint
npm run build
```
