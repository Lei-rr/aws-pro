import { copyText } from '../../../shared/utils/clipboard.js';

export default {
    props: { value: [String, Number] },
    methods: {
        async copy() {
            await copyText(this.value);
        }
    },
    template: `
        <a-button type="link" size="small" title="复制" class="copy-button" @click="copy">
            <template #icon><span aria-hidden="true">⧉</span></template>
        </a-button>
    `
};
