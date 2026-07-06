import { loadAccounts, useAccountStore } from '../stores/accounts.js';
import { message } from '../plugins/antDesignVue.js';
import { errorMessage } from '../utils/errors.js';

export default {
    name: 'AccountSelect',
    props: {
        modelValue: { type: String, default: '' }
    },
    emits: ['update:modelValue', 'loaded'],
    data() {
        return {
            loading: false
        };
    },
    computed: {
        accounts() {
            return this.accountStore.accounts || [];
        }
    },
    setup() {
        return { accountStore: useAccountStore() };
    },
    async mounted() {
        await this.load();
    },
    methods: {
        async load() {
            this.loading = true;
            try {
                await loadAccounts();
                this.$emit('loaded', this.accounts);
                if (!this.modelValue && this.accounts[0]) {
                    this.$emit('update:modelValue', this.accounts[0].id);
                }
            } catch (e) {
                this.$emit('loaded', this.accounts);
                message.error(errorMessage(e, '加载账号失败'));
            } finally {
                this.loading = false;
            }
        }
    },
    template: `
        <a-select
            style="width: 100%"
            :value="modelValue"
            :loading="loading"
            :disabled="loading"
            placeholder="选择账号"
            @change="$emit('update:modelValue', $event)"
        >
            <a-select-option v-for="item in accounts" :key="item.id" :value="item.id">
                {{ item.remark ? item.id + ' - ' + item.remark : item.id }}
            </a-select-option>
        </a-select>
    `
};
