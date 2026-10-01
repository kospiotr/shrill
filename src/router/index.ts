import { createRouter, createWebHistory } from 'vue-router'
import AlmanacView from '../views/AlmanacView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'almanac',
      component: AlmanacView,
    },
    {
      path: '/plant',
      name: 'plant',
      component: () => import('../views/PlantView.vue'),
    },
    {
      path: '/garden',
      name: 'garden',
      component: () => import('../views/GardenView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
