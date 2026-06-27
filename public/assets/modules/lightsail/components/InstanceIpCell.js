import CopyButton from './CopyButton.js';

export default {
    name: 'InstanceIpCell',
    components: { CopyButton },
    props: {
        row: { type: Object, required: true }
    },
    methods: {
        primaryIp(row) {
            return row.static_ip || row.public_ip || '';
        },
        shortText(value, length = 18) {
            const text = String(value || '');
            return text.length > length ? `${text.slice(0, length)}...` : text;
        }
    },
    template: `
        <div class="ip-cell">
            <span v-if="primaryIp(row)" class="copy-cell">
                <a-typography-text code class="truncate-text" :title="primaryIp(row)">{{ primaryIp(row) }}</a-typography-text>
                <copy-button :value="primaryIp(row)" />
            </span>
            <span v-else>-</span>
            <div v-if="row.static_ip && row.public_ip && row.static_ip !== row.public_ip" style="margin-top: 4px; color: #8c8c8c; font-size: 12px">公网 {{ row.public_ip }}</div>
            <span v-if="row.ipv6" class="copy-cell">
                <a-typography-text type="secondary" code class="truncate-text" :title="row.ipv6">{{ shortText(row.ipv6, 16) }}</a-typography-text>
                <copy-button :value="row.ipv6" />
            </span>
        </div>
    `
};
