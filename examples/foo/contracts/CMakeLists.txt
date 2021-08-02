find_package(blanc)
include(EosioWasmToolchain)

add_executable(foo src/foo.cpp)
target_include_directories(foo PUBLIC include)
target_compile_options(foo PUBLIC -contract=foo)
set_target_properties(foo PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/foo)

