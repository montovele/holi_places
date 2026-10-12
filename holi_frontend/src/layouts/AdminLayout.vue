<script setup>
import { ref } from 'vue'
import AppHeader from '../components/navigation/AppHeader.vue'
import AppSidebar from '../components/navigation/AppSidebar.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <div class="admin-shell">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="admin-main">
      <AppHeader @toggle-menu="sidebarOpen = !sidebarOpen" />
      <main class="page-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>