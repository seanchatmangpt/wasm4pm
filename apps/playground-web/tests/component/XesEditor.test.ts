/**
 * Component tests for XesEditor.client.vue
 *
 * XesEditor wraps VueMonacoEditor (infrastructure boundary — needs full Electron/browser runtime).
 * The stub replaces Monaco with a plain <textarea> that mirrors the v-model:value / @change API.
 * We test OUR logic: prop forwarding, the handleChange emit, readOnly attribute.
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import XesEditor from '../../app/components/content/XesEditor.client.vue'

// Monaco infrastructure stub: mirrors VueMonacoEditor's :value / :options / @change API.
const MonacoStub = {
  name: 'MonacoEditor',
  props: ['value', 'language', 'options'],
  emits: ['change'],
  template: '<textarea :value="value" :readonly="options && options.readOnly" @input="$emit(\'change\', $event.target.value)" />'
}

const globalStubs = { VueMonacoEditor: MonacoStub }

describe('XesEditor', () => {
  it('renders a container with the given height', async () => {
    const wrapper = mount(XesEditor, {
      props: { modelValue: '', height: '300px' },
      global: { stubs: globalStubs }
    })
    await flushPromises()
    const div = wrapper.find('div')
    expect(div.attributes('style')).toContain('height: 300px')
  })

  it('passes modelValue down to the editor', async () => {
    const wrapper = mount(XesEditor, {
      props: { modelValue: '<log/>', height: '200px' },
      global: { stubs: globalStubs }
    })
    await flushPromises()
    const textarea = wrapper.find('textarea')
    expect(textarea.element.value).toBe('<log/>')
  })

  it('emits update:modelValue when content changes', async () => {
    const wrapper = mount(XesEditor, {
      props: { modelValue: '', height: '200px' },
      global: { stubs: globalStubs }
    })
    await flushPromises()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('<log><trace/></log>')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['<log><trace/></log>'])
  })

  it('passes readOnly=true to editor options', async () => {
    const wrapper = mount(XesEditor, {
      props: { modelValue: '<log/>', height: '200px', readOnly: true },
      global: { stubs: globalStubs }
    })
    await flushPromises()
    const textarea = wrapper.find('textarea')
    // readOnly prop forwarded to options.readOnly → textarea[readonly]
    expect(textarea.attributes('readonly')).toBeDefined()
  })

  it('defaults to xml language', async () => {
    const wrapper = mount(XesEditor, {
      props: { modelValue: '', height: '200px' },
      global: { stubs: globalStubs }
    })
    await flushPromises()
    // language prop is passed down — stub receives it; we verify the prop binding
    const monacoEl = wrapper.findComponent(MonacoStub)
    expect(monacoEl.props('language')).toBe('xml')
  })
})
