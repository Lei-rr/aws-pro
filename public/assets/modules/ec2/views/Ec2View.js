import Ec2Toolbar from '../components/Ec2Toolbar.js';
import Ec2List from '../components/Ec2List.js';
import CreateEc2Dialog from '../components/CreateEc2Dialog.js';
import InstanceRemarkDialog from '../../../shared/components/InstanceRemarkDialog.js';
import { ec2Computed, ec2Methods, ec2Mounted, ec2State } from '../utils/ec2Page.js';

export default {
    name: 'Ec2View',
    components: { Ec2Toolbar, Ec2List, CreateEc2Dialog, InstanceRemarkDialog },
    data: ec2State,
    computed: ec2Computed,
    mounted: ec2Mounted,
    methods: ec2Methods,
    template: `
        <div class="stacked-page">
            <ec2-toolbar
                v-model:account-id="accountId"
                v-model:region="region"
                :regions="regions"
                :syncing="syncing"
                @sync="sync"
                @create="openCreate"
                @copy="copyInstanceList"
            />
            <ec2-list
                :loading="loading"
                :instances="instances"
                :regions="regions"
                :account-options="accountOptions"
                :type-options="typeOptions"
                @operate="operate"
                @remark="openRemark"
            />
            <instance-remark-dialog v-model:visible="remarkVisible" :saving="remarkSaving" :form="remarkForm" @save="saveRemark" />
            <create-ec2-dialog
                v-model:visible="createVisible"
                :loading="configLoading"
                :creating="creating"
                :account-id="accountId"
                :region-label="createRegionLabel"
                :form="createForm"
                :options="options"
                @submit="createInstance"
            />
        </div>
    `
};
