#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] r2 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 18 ");

      send_action i21("i21"_n, {get_self(), "active"_n});
      i21.send(value);

      require_recipient("n22"_n);
   }

   using send_action = action_wrapper<"send"_n, &r2::send>;
};