cmake_minimum_required(VERSION 3.16)

project(foo)

option(BUILD_TESTING "Build tests" "On")

add_subdirectory(contracts)

if(BUILD_TESTING)
  enable_testing()
  add_subdirectory(test)
endif()

