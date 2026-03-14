import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'

export function createEditor(container) {
  const state = EditorState.create({
    doc: '// Loading design...',
    extensions: [
      basicSetup,
      javascript(),
      oneDark,
      EditorView.theme({
        '&': { height: '100%', fontSize: '14px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: '"Fira Code", "JetBrains Mono", monospace' }
      })
    ]
  })

  const view = new EditorView({
    state,
    parent: container
  })

  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode: (code) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code }
      })
    }
  }
}
