import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'

export const antDesignVue = Antd
export const message = Antd.message
export const modal = Antd.Modal

export function installAntDesignVue(app) {
  app.use(Antd)
}
