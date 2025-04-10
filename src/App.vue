<script setup lang="ts">
import {RouterView} from 'vue-router'
import MainMenuComponent from './components/MainMenuComponent.vue'
</script>

<template>
  <header>
    <MainMenuComponent/>
  </header>
  <main>
    <RouterView/>
  </main>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
}

header {
  flex-shrink: 0;
}

main {
  flex-grow: 1;
  overflow-y: auto;
  padding: 15px;
}
</style>
