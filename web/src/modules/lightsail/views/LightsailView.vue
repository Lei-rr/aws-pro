<template>

        <div class="stacked-page">
            <instance-toolbar
                v-model:account-id="accountId"
                v-model:region="region"
                :syncing="syncing"
                @regions-loaded="regions = $event"
                @sync="sync"
                @create="openCreate"
                @copy="copyInstanceList"
            />
            <instance-list
                :loading="loading"
                :instances="instances"
                :regions="regions"
                :account-options="accountOptions"
                :bundle-options="bundleOptions"
                @operate="operate"
                @remark="openRemark"
            />
            <instance-remark-dialog v-model:visible="remarkVisible" :saving="remarkSaving" :form="remarkForm" @save="saveRemark" />
            <create-instance-dialog
                v-model:visible="createVisible"
                :loading="configLoading"
                :creating="creating"
                :account-id="accountId"
                :region-label="createRegionLabel"
                :form="createForm"
                :options="createOptions"
                :bundle-options="createBundleOptions"
                :blueprints="blueprints"
                @ip-type-change="ensureCreateBundle"
                @submit="createInstance"
            />
        </div>
    
</template>

<script>
import InstanceToolbar from '../components/InstanceToolbar.vue';
import InstanceList from '../components/InstanceList.vue';
import CreateInstanceDialog from '../components/CreateInstanceDialog.vue';
import InstanceRemarkDialog from '../../../shared/components/InstanceRemarkDialog.vue';
import { lightsailComputed, lightsailMethods, lightsailMounted, lightsailState } from '../utils/lightsailPage.js';

export default {
    name: 'LightsailView',
    components: { InstanceToolbar, InstanceList, CreateInstanceDialog, InstanceRemarkDialog },
    data: lightsailState,
    computed: lightsailComputed,
    mounted: lightsailMounted,
    methods: lightsailMethods
    };
</script>
