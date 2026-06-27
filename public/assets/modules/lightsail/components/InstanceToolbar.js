import AccountSelect from '../../accounts/components/AccountSelect.js';
import RegionSelect from '../../system/components/RegionSelect.js';

export default {
    name: 'InstanceToolbar',
    components: { AccountSelect, RegionSelect },
    props: {
        accountId: { type: String, default: '' },
        region: { type: String, default: '' },
        syncing: { type: Boolean, default: false }
    },
    emits: ['update:accountId', 'update:region', 'regions-loaded', 'sync', 'create', 'copy'],
    template: `
        <section class="operation-toolbar">
            <div class="page-toolbar operation-titlebar">
                <div>
                    <a-typography-title :level="3" style="margin-bottom: 4px">实例运营台</a-typography-title>
                    <a-typography-text type="secondary">选择账号和区域后同步、创建或复制实例 IP。</a-typography-text>
                </div>
            </div>
            <div class="operation-controls">
                <div class="toolbar-control"><account-select :model-value="accountId" @update:model-value="$emit('update:accountId', $event)" /></div>
                <div class="toolbar-control"><region-select :model-value="region" @update:model-value="$emit('update:region', $event)" @loaded="$emit('regions-loaded', $event)" /></div>
                <a-button type="primary" :loading="syncing" @click="$emit('sync')">同步</a-button>
                <a-button @click="$emit('create')">创建实例</a-button>
                <a-button @click="$emit('copy')">一键复制</a-button>
            </div>
        </section>
    `
};
