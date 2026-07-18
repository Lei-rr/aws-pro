<template>

        <section class="operation-toolbar">
            <ListToolbar title="EC2 运营台" subtitle="选择账号和 EC2 区域后同步、创建或复制实例 IP。" :show-search="false" />
            <div class="operation-controls">
                <div class="toolbar-control"><account-select :model-value="accountId" @update:model-value="$emit('update:accountId', $event)" /></div>
                <div class="toolbar-control">
                    <a-select :value="region" style="width: 100%" placeholder="选择 EC2 区域" @change="$emit('update:region', $event)">
                        <a-select-option v-for="(name, id) in regions" :key="id" :value="id">{{ name }}</a-select-option>
                    </a-select>
                </div>
                <a-button type="primary" :loading="syncing" @click="$emit('sync')">同步</a-button>
                <a-button @click="$emit('create')">创建实例</a-button>
                <a-button @click="$emit('copy')">一键复制</a-button>
            </div>
        </section>
    
</template>

<script>
import ListToolbar from '../../../shared/components/ListToolbar.vue'
import AccountSelect from '../../../shared/components/AccountSelect.vue';

export default {
    name: 'Ec2Toolbar',
    components: { AccountSelect, ListToolbar },
    props: {
        accountId: { type: String, default: '' },
        region: { type: String, default: '' },
        regions: { type: Object, default: () => ({}) },
        syncing: { type: Boolean, default: false }
    },
    emits: ['update:accountId', 'update:region', 'sync', 'create', 'copy']
    };
</script>
