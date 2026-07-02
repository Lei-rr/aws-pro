import { loadConfig, useConfigStore } from '../store/config.js';
import { message } from '../../../shared/plugins/antDesignVue.js';
import { errorMessage } from '../../../shared/utils/errors.js';

export default {
    name: 'RegionSelect',
    props: {
        modelValue: { type: String, default: '' }
    },
    emits: ['update:modelValue', 'loaded'],
    computed: {
        regions() {
            return this.configStore.config?.regions || {};
        }
    },
    setup() {
        return { configStore: useConfigStore() };
    },
    async mounted() {
        try {
            await loadConfig();
            this.$emit('loaded', this.regions);
            if (!this.modelValue) {
                const first = Object.keys(this.regions)[0] || 'ap-northeast-1';
                this.$emit('update:modelValue', first);
            }
        } catch (e) {
            this.$emit('loaded', this.regions);
            message.error(errorMessage(e, '加载区域失败'));
        }
    },
    template: `
        <a-select style="width: 100%" :value="modelValue" placeholder="选择区域" @change="$emit('update:modelValue', $event)">
            <a-select-option v-for="(name, id) in regions" :key="id" :value="id">
                {{ name }}
            </a-select-option>
        </a-select>
    `
};
