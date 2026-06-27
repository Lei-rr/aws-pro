export const antDesignVue = window.antd || window.AntDesignVue

if (!antDesignVue) {
  throw new Error('Ant Design Vue is not loaded')
}

export const message = antDesignVue.message
export const modal = antDesignVue.Modal
