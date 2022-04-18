#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] i14 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 15 ");

      send_action i141("i141"_n, {get_self(), "active"_n});
      i141.send(value);

      require_recipient("n142"_n);
   }

   using send_action = action_wrapper<"send"_n, &i14::send>;
};