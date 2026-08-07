<template>
  <section class="glass-card">
    <slot></slot>
  </section>
</template>

<style scoped>
.glass-card {
  width: 100%;
  height: fit-content;
  align-self: start;
  border: 1px solid var(--line);
  background: linear-gradient(145deg, rgba(16, 21, 36, 0.84), rgba(12, 17, 30, 0.9));
  border-radius: 1rem;
  box-shadow: 0 16px 45px rgba(8, 11, 23, 0.36);
}
</style>
