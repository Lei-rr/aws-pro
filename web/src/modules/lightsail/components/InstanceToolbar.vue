<template>

        <section class="operation-toolbar">
            <ListToolbar title="实例运营台" subtitle="选择账号和区域后同步、创建或复制实例 IP。" :show-search="false" />
            <div class="operation-controls">
                <div class="toolbar-control"><account-select :model-value="accountId" @update:model-value="$emit('update:accountId', $event)" /></div>
                <div class="toolbar-control"><region-select :model-value="region" @update:model-value="$emit('update:region', $event)" @loaded="$emit('regions-loaded', $event)" /></div>
                <a-button type="primary" :loading="syncing" @click="$emit('sync')">同步</a-button>
                <a-button @click="$emit('create')">创建实例</a-button>
                <a-button @click="$emit('copy')">一键复制</a-button>
            </div>
        </section>
    
</template>

<script>
import ListToolbar from '../../../shared/components/ListToolbar.vue'
import AccountSelect from '../../../shared/components/AccountSelect.vue';
import RegionSelect from '../../../shared/components/RegionSelect.vue';

export default {
    name: 'InstanceToolbar',
    components: { AccountSelect, RegionSelect, ListToolbar },
    props: {
        accountId: { type: String, default: '' },
        region: { type: String, default: '' },
        syncing: { type: Boolean, default: false }
    },
    emits: ['update:accountId', 'update:region', 'regions-loaded', 'sync', 'create', 'copy']
    };
</script>
