add_custom_target(foo_test ALL npm install WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
add_test(NAME foo_test COMMAND npm run test WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})

