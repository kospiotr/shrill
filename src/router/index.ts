import { createRouter, createWebHistory } from 'vue-router'
import UploadView from '../views/UploadView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'upload',
      component: UploadView,
    },
    {
      // The share link for an upload. The id is optional so the page can also
      // be opened bare and have one pasted in.
      path: '/d/:id?',
      name: 'download',
      component: () => import('../views/DownloadView.vue'),
    },
    {
      path: '/files',
      name: 'files',
      component: () => import('../views/FilesView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
