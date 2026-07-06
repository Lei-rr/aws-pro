import CopyButton from '../../lightsail/components/CopyButton.js';

export default {
    name: 'Ec2IpCell',
    components: { CopyButton },
    props: {
        row: { type: Object, required: true }
    },
    methods: {
        shortText(value, length = 18) {
            const text = String(value || '');
            return text.length > length ? `${text.slice(0, length)}...` : text;
        }
    },
    template: `
        <div class="ip-cell">
            <span v-if="row.public_ipv4" class="copy-cell">
                <a-typography-text code class="truncate-text" :title="row.public_ipv4">{{ row.public_ipv4 }}</a-typography-text>
                <copy-button :value="row.public_ipv4" />
            </span>
            <span v-else>-</span>
            <span v-if="row.public_ipv6" class="copy-cell">
                <a-typography-text type="secondary" code class="truncate-text" :title="row.public_ipv6">{{ shortText(row.public_ipv6, 16) }}</a-typography-text>
                <copy-button :value="row.public_ipv6" />
            </span>
        </div>
    `
};
