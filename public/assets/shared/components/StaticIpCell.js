export default {
    name: 'StaticIpCell',
    props: {
        row: { type: Object, required: true }
    },
    emits: ['operate'],
    template: `
        <a-space size="small">
            <a-tag :color="row.static_ip ? 'success' : 'default'">{{ row.static_ip ? '已绑定' : '未绑定' }}</a-tag>
            <a-button v-if="row.static_ip" type="link" danger size="small" style="padding: 0" @click="$emit('operate', row, 'release_static_ip')">释放</a-button>
            <a-button v-else type="link" size="small" style="padding: 0" @click="$emit('operate', row, 'allocate_static_ip')">获取</a-button>
        </a-space>
    `
};
